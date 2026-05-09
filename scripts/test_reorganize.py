#!/usr/bin/env python3
"""Test script to verify reorganize_code.py guardrails"""

test_content = """// Test file
line 1
// MOVE START: test_section
line 3
line 4
// MOVE END: test_section
line 6
// MOVE HERE: test_section
line 8
"""

# Test case 1: Valid section (HERE outside START-END)
print("Test 1: Valid section")
print(test_content)
print("\n" + "=" * 60)

# Test case 2: Invalid - HERE inside START-END
test_content_bad = """// Test file
line 1
// MOVE START: bad_section
line 3
// MOVE HERE: bad_section
line 5
// MOVE END: bad_section
line 7
"""

print("\nTest 2: Invalid - HERE inside START-END")
print(test_content_bad)
print("\n" + "=" * 60)

# Test case 3: Invalid - START after END
test_content_bad2 = """// Test file
line 1
// MOVE END: bad_section2
line 3
// MOVE START: bad_section2
line 5
// MOVE HERE: bad_section2
line 7
"""

print("\nTest 3: Invalid - START after END")
print(test_content_bad2)
