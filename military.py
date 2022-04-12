nationality = input("Are you a Ghanaian: (Enter Y for yes and N for no)")
age = int(input("Enter your age: "))
qualification = input("Are you a WASSCE holder (Y/N): ")
height = float(input("Enter your height: "))

if nationality == "Y" and age >= 18 and qualification == "Y" and height >= 172:
    print("you qualify")
else:
    print("you don't qualify")

