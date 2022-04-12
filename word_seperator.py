index_list = []
char_list = []
sentence = input("Enter a sentence in which all the words run together: ")
i = 0
for ch in range(len(sentence)):
    if sentence[ch].isupper():
        index = sentence.find(sentence[ch], ch+i)
        index_list.append(index)
        char_list.append(sentence[ch])

for i in range(len(char_list)-1):
    print(sentence[index_list[i]:index_list[i+1]])

print(sentence[index_list[-1]:])
