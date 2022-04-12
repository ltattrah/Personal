keep_going = 'y'
counter = 1

while keep_going == 'y':

    # get the sales and commission rate
    print("Customer", counter)
    sales = float(input("Enter the amount of sales: "))
    rate = float(input("Enter the commission rate: "))

    commission = sales * rate

    print(f"The commission is {commission:,.2f}")

    keep_going = input("Do you want to calculate"
                       "another commission (Enter y for yes): ")
    counter += 1
