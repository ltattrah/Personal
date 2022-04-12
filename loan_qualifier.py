salary = float(input("Enter your salary: "))
years = int(input("Enter the number of years worked: "))

if salary >= 30000:
    if years >= 2:
        print("you qualify")
    else:
        print("you must have worked for 2 years")
else:
    print("you do not qualify")
    print("you should earn at leat 30,000")