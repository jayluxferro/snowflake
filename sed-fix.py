#!/usr/bin/env python3

data = ''
for x in open('./src/make.js', 'r').readlines():
    if x.find('sed -i') != -1:
        x = x.replace('sed -i', 'gsed -i')
    data += x

with open('./src/make.js', 'w') as f:
    f.write(data)

