# This program reads the contents of the
# philosophers.txt file one line at a time
def main():
    # Open a file named philosophers.txt
    infile = open('philosophers.txt', 'r')
    line1 = infile.readline()
    line2 = infile.readline()
    line3 = infile.readline()
    infile.close()

    print(line1, end='')
    print(line2, end='')
    print(line3, end='')


main()

