def main():
    output_file = open("philosophers.txt", 'r')
    content = output_file.read()
    output_file.close()

    print("The list of Philosophers are: \n", content)


main()
