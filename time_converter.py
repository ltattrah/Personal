total_seconds = 11730

hours = total_seconds // 3600
minutes = (total_seconds // 60) % 60
seconds = total_seconds % 60

print("Hours:", hours, end='')
print("Minutes:", minutes, end=' ')
print("Seconds" * 5, "me", sep="&")

