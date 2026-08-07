import re

with open('bot.py', 'r') as f:
    content = f.read()

# Replace the block
old_block = """    models_to_try = [
        'gemini-3.5-flash', 
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-1.5-flash'
    ]"""

new_block = """    models_to_try = [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-1.0-pro'
    ]"""

content = content.replace(old_block, new_block)

with open('bot.py', 'w') as f:
    f.write(content)

