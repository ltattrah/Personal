sentence = input("Enter a sentence: ")

char_list = [sentence[0]]
count_list = [1]
total = 0
for i in range(1, len(sentence) - 1):
    if sentence[i] not in char_list:
        char_list.append(sentence[i])
        count_list.append(1)

    else:
        # char_list[i] = sentence[i]
        count_list[i] += 1

print('Character\tQty')
for j in range(len(char_list)):
    print(f'{char_list[j]}\t\t: {count_list[j]}')
