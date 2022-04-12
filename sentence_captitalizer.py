
def capitalize_string(my_string):
    tokens = my_string.split('.')
    for word in tokens:
        word = word.strip()
        new_words = word.capitalize()
        print(new_words+'. ', end='')


def main():
    sentence = input('Please enter a sentece:')
    print('The new sentence after capitalizing is:')
    print(capitalize_string(sentence))


main()