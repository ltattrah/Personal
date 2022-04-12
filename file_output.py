
def main():
    # open a file name philosophers.txt
    outfile =    open('philosophers.txt', 'w')

    # Write the names of three philosoppers to file
    outfile.write("John Locke\n")
    outfile.write("Leo Tattrah\n")
    outfile.write("Victor Tattrah\n")

    # close the file
    outfile.close()


if __name__ == '__main__':
    main()