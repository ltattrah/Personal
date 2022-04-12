BASE_HOURS = 40
OT_MULTIPLIER = 1.5

# Get the hours worked and the hourly pay rate.
hours = float(input('Enter the number of hours worked: '))
pay_rate = float(input('Enter the hourly pay rate: '))

# calculate and display the gross pay
if hours > BASE_HOURS:
    overtime_hours = hours - BASE_HOURS
    gross_pay = BASE_HOURS * pay_rate + overtime_hours * OT_MULTIPLIER
else:
    # Calculate the gross pay without overtime.
    gross_pay = hours * pay_rate

print(f'The gross pay is $ {gross_pay:,.2f}')

