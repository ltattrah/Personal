import random

ROWS = 3
COLS = 4


def main():
    values = [[0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0]]

    for r in range(ROWS):
        for c in range(COLS):
            values[r][c] = (r+1) * (c+1)

    print(values)


if __name__ == '__main__':
    main()
