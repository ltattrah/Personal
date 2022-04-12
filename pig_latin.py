english = input('Enter an english sentence: ')
new_words = []
words = english.split(' ')
for word in words:
    new_word = word[1:]+word[0]+'AY'
    print(new_word.upper(), end=' ')



