ASSESSMENT_VALUE = 0.6
PROPERTY_TAX = 0.0072

actual_value = float(input("Enter the actual value of the property: "))
assessment = ASSESSMENT_VALUE * actual_value
property_t = PROPERTY_TAX * assessment

print(f"Assessment Value: {assessment:,.2f}")
print(f"Property Tax: {property_t:,.2f}")




