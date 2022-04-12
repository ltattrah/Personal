def main():
    first_name = input("Please enter your first name: ")
    last_name = input("Please enter your last name: ")
    id_number = input("Please enter your ID number: ")

    if len(first_name) < 3:
        first = first_name
    else:
        first = first_name[:3]

    if len(last_name) < 3:
        last = last_name
    else:
        last = last_name[:3]

    if len(id_number) < 3:
        id_num = id_number
    else:
        id_num = id_number[:3]

    print(f'your login is {first}{last}{id_num}')


main()




