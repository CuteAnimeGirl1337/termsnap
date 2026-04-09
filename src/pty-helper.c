/**
 * Minimal PTY recorder — spawns a shell in a pseudo-terminal,
 * captures all output with timestamps, writes asciicast v2 to stdout.
 *
 * Usage: pty-helper <cols> <rows> [shell]
 */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/select.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <sys/time.h>
#include <signal.h>
#include <termios.h>
#include <errno.h>
#include <time.h>

static struct termios orig_termios;
static int master_fd = -1;

static void restore_termios(void) {
    if (isatty(STDIN_FILENO))
        tcsetattr(STDIN_FILENO, TCSAFLUSH, &orig_termios);
}

static void handle_sigchld(int sig) {
    (void)sig;
}

static double now_seconds(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

/* JSON-escape a buffer (handles control chars) */
static void json_escape(FILE *out, const char *buf, int len) {
    for (int i = 0; i < len; i++) {
        unsigned char c = (unsigned char)buf[i];
        switch (c) {
            case '\\': fputs("\\\\", out); break;
            case '"':  fputs("\\\"", out); break;
            case '\b': fputs("\\b", out);  break;
            case '\f': fputs("\\f", out);  break;
            case '\n': fputs("\\n", out);  break;
            case '\r': fputs("\\r", out);  break;
            case '\t': fputs("\\t", out);  break;
            default:
                if (c < 0x20) {
                    fprintf(out, "\\u%04x", c);
                } else {
                    fputc(c, out);
                }
        }
    }
}

int main(int argc, char *argv[]) {
    int cols = argc > 1 ? atoi(argv[1]) : 80;
    int rows = argc > 2 ? atoi(argv[2]) : 24;
    const char *shell = argc > 3 ? argv[3] : getenv("SHELL");
    if (!shell) shell = "/bin/bash";
    const char *output_file = argc > 4 ? argv[4] : NULL;

    FILE *output = stdout;
    if (output_file) {
        output = fopen(output_file, "w");
        if (!output) { perror("fopen"); return 1; }
    }

    /* Open PTY */
    master_fd = posix_openpt(O_RDWR | O_NOCTTY);
    if (master_fd < 0) { perror("posix_openpt"); return 1; }
    if (grantpt(master_fd) < 0) { perror("grantpt"); return 1; }
    if (unlockpt(master_fd) < 0) { perror("unlockpt"); return 1; }

    char *slave_name = ptsname(master_fd);
    if (!slave_name) { perror("ptsname"); return 1; }

    /* Set PTY size */
    struct winsize ws = { .ws_row = rows, .ws_col = cols };
    ioctl(master_fd, TIOCSWINSZ, &ws);

    /* Write asciicast header */
    fprintf(output, "{\"version\":2,\"width\":%d,\"height\":%d,\"timestamp\":%ld}\n",
            cols, rows, (long)time(NULL));
    fflush(output);

    signal(SIGCHLD, handle_sigchld);

    pid_t pid = fork();
    if (pid < 0) { perror("fork"); return 1; }

    if (pid == 0) {
        /* Child: set up slave PTY as controlling terminal */
        close(master_fd);
        setsid();

        int slave_fd = open(slave_name, O_RDWR);
        if (slave_fd < 0) { perror("open slave"); _exit(1); }

        ioctl(slave_fd, TIOCSCTTY, 0);
        ioctl(slave_fd, TIOCSWINSZ, &ws);

        dup2(slave_fd, STDIN_FILENO);
        dup2(slave_fd, STDOUT_FILENO);
        dup2(slave_fd, STDERR_FILENO);
        if (slave_fd > 2) close(slave_fd);

        /* Set TERM and size env vars */
        setenv("TERM", "xterm-256color", 1);
        char buf[16];
        snprintf(buf, sizeof(buf), "%d", cols);
        setenv("COLUMNS", buf, 1);
        snprintf(buf, sizeof(buf), "%d", rows);
        setenv("LINES", buf, 1);

        /* If shell contains spaces, treat as "shell -c <cmd>" */
        if (strchr(shell, ' ') != NULL) {
            execlp("/bin/bash", "bash", "-c", shell, NULL);
        } else {
            execlp(shell, shell, NULL);
        }
        perror("exec");
        _exit(1);
    }

    /* Parent: put terminal in raw mode, relay I/O */
    if (isatty(STDIN_FILENO)) {
        tcgetattr(STDIN_FILENO, &orig_termios);
        atexit(restore_termios);

        struct termios raw = orig_termios;
        cfmakeraw(&raw);
        tcsetattr(STDIN_FILENO, TCSAFLUSH, &raw);
    }

    double start_time = now_seconds();
    char buf[4096];
    int status;

    while (1) {
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(master_fd, &fds);
        if (isatty(STDIN_FILENO))
            FD_SET(STDIN_FILENO, &fds);

        int maxfd = master_fd > STDIN_FILENO ? master_fd : STDIN_FILENO;
        struct timeval tv = { .tv_sec = 0, .tv_usec = 100000 };

        int ret = select(maxfd + 1, &fds, NULL, NULL, &tv);

        if (ret < 0) {
            if (errno == EINTR) continue;
            break;
        }

        /* Check if child exited */
        if (waitpid(pid, &status, WNOHANG) > 0) {
            /* Read any remaining output */
            while (1) {
                int n = read(master_fd, buf, sizeof(buf));
                if (n <= 0) break;
                double elapsed = now_seconds() - start_time;
                write(STDOUT_FILENO, buf, n);  /* echo to terminal */
                fprintf(output, "[%.6f,\"o\",\"", elapsed);
                json_escape(output, buf, n);
                fprintf(output, "\"]\n");
            }
            break;
        }

        /* Data from PTY (program output) */
        if (FD_ISSET(master_fd, &fds)) {
            int n = read(master_fd, buf, sizeof(buf));
            if (n <= 0) break;

            double elapsed = now_seconds() - start_time;

            /* Echo to real terminal */
            write(STDOUT_FILENO, buf, n);

            /* Write event to cast file */
            fprintf(output, "[%.6f,\"o\",\"", elapsed);
            json_escape(output, buf, n);
            fprintf(output, "\"]\n");
            fflush(output);
        }

        /* Data from user (keyboard input) */
        if (isatty(STDIN_FILENO) && FD_ISSET(STDIN_FILENO, &fds)) {
            int n = read(STDIN_FILENO, buf, sizeof(buf));
            if (n <= 0) break;
            write(master_fd, buf, n);
        }
    }

    close(master_fd);
    if (output != stdout) fclose(output);
    return 0;
}
