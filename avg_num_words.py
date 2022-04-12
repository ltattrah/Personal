my_file = open('text.txt', 'r')
total = 0
counter = 0

for line in my_file:
    num_words = len(line.split(' '))
    total += num_words
    counter += 1
    print("Number of words on line", counter, 'is', num_words)

average = total / counter


print("The average of the words is", average)


