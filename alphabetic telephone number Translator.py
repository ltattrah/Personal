directory = [
    ('ABC', '2'),
    ('DEF', '3'),
    ('GHI', '4'),
    ('JKL', '5'),
    ('MNO', '6'),
    ('PQRS', '7'),
    ('TUV', '8'),
    ('WXYZ', '9')
]

tel_num = input("Enter a 10-character telephone number"
                "in the format XXX-XXX-XXXX: ")
tokens = tel_num.split('-')
sec_tokens = tokens[1]
item = 0
third_tokens = tokens[2]
second = ''
third = ''

for i in sec_tokens:
    for my_tuple in directory:
        if i in my_tuple[0]:
            second += my_tuple[1]


for i in third_tokens:
    for my_tuple in directory:
        if i in my_tuple[0]:
            third += my_tuple[1]


print(f'{tokens[0]}-{second}-{third}')
