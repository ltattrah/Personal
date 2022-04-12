upper = 0
lower = 0
digits = 0
whitespace = 0

contents = open('text.txt', 'r')

for line in contents:
    for ch in line:
        if ch.isupper():
            upper += 1
        if ch.islower():
            lower += 1
        if ch.isdigit():
            digits += 1
        if ch.isspace():
            whitespace += 1

contents.close()

print(f'Type\t\t|\tQty')
print('----------------------------')
print(f'Lowercase:\t {lower:>5}')
print(f'Uppercase:\t {upper:>5}')
print(f'Digits:\t\t {digits:>5}')
print(f'Whitespace:\t {whitespace:>5}')

