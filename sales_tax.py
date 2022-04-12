STATE_SALES_TAX = 0.05
COUNTY_STATE_TAX = 0.025

total_sales = float(input("Please enter total sales: "))
county_tax = COUNTY_STATE_TAX * total_sales
state_tax = STATE_SALES_TAX * total_sales
sales_tax = county_tax + state_tax

print(f'The amount of county sales tax: {county_tax:,.2f}')
print(f'The amount of county sales tax: {state_tax:,.2f}')
print(f'The total sales tax: {sales_tax:,.2f}')

