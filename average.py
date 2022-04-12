test_1 = float(input("Enter score for test 1: "))
test_2 = float(input("Enter score for test 2: "))
test_3 = float(input("Enter score for test 3: "))

average = (test_1 + test_2 + test_3) / 3

print("Your average is", average)
if average > 95:
    print("Congratulations, You have done well")
