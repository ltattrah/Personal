def valid_password(password):
    # password = 'Theboogy329!'
    correct_length = False
    has_uppercase = False
    has_lowercase = False
    has_digit = False

    if len(password) >= 7:
        correct_length = True

        for i in password:
            if i.isupper():
                has_uppercase = True
            if i.islower():
                has_lowercase = True
            if i.isdigit():
                has_digit = True

    return has_digit and has_lowercase and has_uppercase and correct_length


def main():
    if valid_password('eboogy329!'):
        print("Valid")
    else:
        print('Not valid')


if __name__ == '__main__':
    main()