def main():
    lines = []
    try:
        csv_file = open('test_scores.csv', 'r')

        lines = csv_file.readlines()

        csv_file.close()

    except FileNotFoundError:
        print('Error: The file cannot be found')

    for line in lines:
        scores = line.split(',')
        total = 0.0

        average = total / len(scores)
        print(f'Average: {average:>6.2f}')


main()
