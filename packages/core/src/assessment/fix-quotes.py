#!/usr/bin/env python3
"""Fix regular double quotes inside double-quoted strings by switching to backtick template literals."""
import os
import re

filepath = os.path.join(os.path.dirname(__file__), 'script-copy.ts')

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find all lines in the V2 ZH section that have nested double quotes
# Pattern: lines where a string value contains " inside ""
# Strategy: For lines that have key: "...inner"quotes"...",
# change the outer quotes to backticks

# Specifically fix these known problematic patterns in the ZH V2 section:
fixes = [
    # conflict_friend setup - contains ："...。"
    ('setup: "你和一个认识很久的好朋友一起做了件事，结果不太好。复盘的时候，ta 直接说："主要还是你那一块没搞好。"语气很确定，就你们两个人。你知道这不完全公平——至少不只是你的问题。"',
     "setup: `你和一个认识很久的好朋友一起做了件事，结果不太好。复盘的时候，ta 直接说：\"主要还是你那一块没搞好。\"语气很确定，就你们两个人。你知道这不完全公平——至少不只是你的问题。`"),
    # stress_chronic prompt
    ('prompt: "在这种"看不到头"的状态里，你通常怎么撑？"',
     'prompt: `在这种"看不到头"的状态里，你通常怎么撑？`'),
    # stress_chronic option B feedback
    ('feedback: "你能从惯性里抬头——虽然"换路"本身也需要勇气。"',
     'feedback: `你能从惯性里抬头——虽然"换路"本身也需要勇气。`'),
    # stress_chronic option C feedback  
    ('feedback: "你能把大问题拆成小步——但有时候"不想太远"也是一种回避。"',
     'feedback: `你能把大问题拆成小步——但有时候"不想太远"也是一种回避。`'),
    # social_lowenergy setup
    ('setup: "你已经连续好几天独处，精力很低，什么都不太想做。这时候一个关系很近的朋友发来消息："今晚出来坐坐？就我们两个，不用打扮不用social。"",',
     'setup: `你已经连续好几天独处，精力很低，什么都不太想做。这时候一个关系很近的朋友发来消息："今晚出来坐坐？就我们两个，不用打扮不用social。"`,'),
    # motive_silence prompt
    ('prompt: "当你选择"沉默"的时候，最接近你真实原因的是哪一个？"',
     'prompt: `当你选择"沉默"的时候，最接近你真实原因的是哪一个？`'),
    # motive_silence option C feedback (uses single quotes already from earlier)
    # reality_refuse setup
    ('setup: "最近发生过这样的事吗：你心里第一反应是"不想"或"不太愿意"，但最后还是做了？"',
     'setup: `最近发生过这样的事吗：你心里第一反应是"不想"或"不太愿意"，但最后还是做了？`'),
]

count = 0
for old, new in fixes:
    if old in content:
        content = content.replace(old, new)
        count += 1
        print(f"Fixed: {old[:50]}...")
    else:
        print(f"NOT FOUND: {old[:50]}...")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nTotal fixes applied: {count}")
