# Contributing to Adult Toy Library

Thank you for your interest in contributing to the Adult Toy Library! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* Use a clear and descriptive title
* Describe the exact steps to reproduce the problem
* Provide specific examples to demonstrate the steps
* Describe the behavior you observed after following the steps
* Explain which behavior you expected to see instead and why
* Include device type and firmware version if relevant
* Include logs if available

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* Use a clear and descriptive title
* Provide a detailed description of the suggested enhancement
* Provide specific examples to demonstrate the steps
* Describe the current behavior and explain why it's insufficient
* Explain why this enhancement would be useful
* List some other libraries or applications where this enhancement exists

### Adding Protocol Support

When adding support for a new device protocol:

1. Create a new class in the `protocols` directory
2. Extend the base `BLEProtocol` class
3. Implement required methods:
   - `connect()`
   - `disconnect()`
   - `vibrate()`
   - `stop()`
   - `getBatteryLevel()`
4. Add protocol documentation
5. Add tests
6. Update the device compatibility list

### Pull Requests

* Do not include issue numbers in the PR title
* Follow the coding style used throughout the project
* Include tests for new functionality
* Document new code based on PHPDoc standard
* Update documentation as needed
* End all files with a newline
* Add yourself to CONTRIBUTORS.md

## Development Process

1. Fork the repo and create your branch from `main`
2. Run `composer install` to install dependencies
3. Make your changes
4. Run tests: `composer test`
5. Run linter: `composer lint`
6. Create pull request

## Coding Standards

* Use PSR-12 coding standard
* Use PHP 7.4 type hints where possible
* Keep functions small and focused
* Document all public methods
* Use meaningful variable names
* Add comments for complex logic
* Keep line length under 120 characters

## Testing

* Write tests for new functionality
* Maintain existing tests
* Run full test suite before submitting PR
* Include both unit and integration tests
* Mock device connections in tests

## Git Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests after the first line
* Consider starting the commit message with:
  * feat: (new feature)
  * fix: (bug fix)
  * docs: (documentation)
  * style: (formatting, missing semicolons, etc)
  * refactor: (refactoring code)
  * test: (adding tests)
  * chore: (updating grunt tasks etc)

## Documentation

When adding or updating documentation:

1. Use clear and concise language
2. Include code examples
3. Keep examples focused and minimal
4. Check spelling and grammar
5. Update table of contents
6. Test code examples
7. Add links to related docs
8. Include security considerations

## Protocol Documentation

When documenting new protocols:

1. Include service UUIDs
2. List supported devices
3. Document command format
4. Include example commands
5. List supported features
6. Document error codes
7. Include connection sequence
8. Document security measures

## Security

* Never commit API keys or credentials
* Use environment variables for sensitive data
* Sanitize all inputs
* Validate all parameters
* Handle errors gracefully
* Use secure connection methods
* Document security considerations
* Follow secure coding practices

## Review Process

Pull requests are reviewed by maintainers based on:

1. Code quality
2. Test coverage
3. Documentation
4. Security considerations
5. Performance impact
6. Maintainability
7. Compatibility
8. Standards compliance

## Getting Help

* Join our Discord channel
* Check the documentation
* Search existing issues
* Ask in the discussion forum
* Contact maintainers

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
