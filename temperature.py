counter = 0
# get the substance's temperature
while counter >= 0:
    temperature = float(input("Enter substance's temperature: "))
    while temperature > 102.2:
        print("Turn down the thermostat,"
              "wait 5 minutes, and check the "
              "temperature again")
        temperature = float(input("Enter substance's temperature: "))

    print("The temperature is acceptable")
    counter += 15
    print("15 minutes later..")
