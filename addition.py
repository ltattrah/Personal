def addition(*nums):
    total = 0
    for num in nums:
        total += num
    return total


ans = addition(3, 4, 5)
print(ans)
