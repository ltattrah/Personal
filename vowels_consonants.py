def vowel_counter(my_string):
    """
    this program counts the number of vowels in the my_string
    and returns the number of vowels in the string
    :param my_string:
    :return: number of vowels
    """
    total = 0
    vowels = 'aeiou'
    for ch in my_string:
        if ch in vowels:
            total += 1
    return total


def consonant_count(my_string):
    """
    This function counts the number of consonants
    in my_string
    :param my_string:
    :return: number of consonants
    """
    total = 0
    consonants = 'bcdfghjklmnpqrstvwxyz'
    for ch in my_string:
        if ch in consonants:
            total += 1
    return total


def main():
    vowel = 'vowels'
    consonant = 'Consonants'
    a_string = input("Enter a string: ")
    print(f'{vowel:<10}: {vowel_counter(a_string):>5}')
    print(f'{consonant:<10}: {consonant_count(a_string):>5}')


main()
