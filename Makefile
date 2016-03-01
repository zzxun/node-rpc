TESTS = test/test.js

test:
	@mocha $(TESTS)

test-cover:
	@istanbul cover _mocha -- $(TESTS)

.PHONY: test