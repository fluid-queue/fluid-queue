<!-- omit in toc -->

# Contributing to fluid-queue

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. See the [Table of Contents](#table-of-contents) for different ways to help and details about how this project handles them. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
>
> - Star the project
> - Talk about it on social media
> - Refer this project in your project's readme
> - Mention the project at local meetups and tell your friends/colleagues

<!-- omit in toc -->

## Table of Contents

- [Contributing to fluid-queue](#contributing-to-fluid-queue)
  - [Table of Contents](#table-of-contents)
  - [I Have a Question](#i-have-a-question)
    - [Discord Server](#discord-server)
  - [I Want To Contribute](#i-want-to-contribute)
    - [Reporting Bugs](#reporting-bugs)
      - [Before Submitting a Bug Report](#before-submitting-a-bug-report)
      - [How Do I Submit a Good Bug Report?](#how-do-i-submit-a-good-bug-report)
    - [Suggesting Enhancements](#suggesting-enhancements)
      - [Before Submitting an Enhancement](#before-submitting-an-enhancement)
      - [How Do I Submit a Good Enhancement Suggestion?](#how-do-i-submit-a-good-enhancement-suggestion)
    - [Your First Code Contribution](#your-first-code-contribution)
      - [Environment Setup](#environment-setup)
      - [Making Your Changes](#making-your-changes)
      - [Opening a Pull Request](#opening-a-pull-request)
      - [Pull Request Reviews](#pull-request-reviews)
    - [Improving The Documentation](#improving-the-documentation)
  - [Styleguides](#styleguides)
    - [Commit Messages](#commit-messages)
  - [Git Workflow](#git-workflow)
    - [Branch Naming](#branch-naming)
  - [Join The Project Team](#join-the-project-team)
  - [Attribution](#attribution)

## I Have a Question

> If you want to ask a question, we assume that you have read the available [Documentation](https://fluid-queue.dev).

Before you ask a question, it is best to search for existing [Issues](https://github.com/fluid-queue/fluid-queue/issues) that might help you. In case you have found a suitable issue and still need clarification, you can write your question in this issue. It is also advisable to search the internet for answers first.

If you then still feel the need to ask a question and need clarification, we recommend the following:

- Open an [Issue](https://github.com/fluid-queue/fluid-queue/issues/new).
- Provide as much context as you can about what you're running into.
- Provide project and platform versions (nodejs, npm, etc), depending on what seems relevant.

We will then take care of the issue as soon as possible.

### Discord Server

We have a Discord server where we can offer support for the bot. If you request support through Discord, we may ask you to open an issue anyway: Github issues have much higher visibility and archivability, so there's a lot of value in going through Github.

## I Want To Contribute

> ### Legal Notice <!-- omit in toc -->
>
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the necessary rights to the content and that the content you contribute may be provided under the project license.

### Reporting Bugs

<!-- omit in toc -->

#### Before Submitting a Bug Report

A good bug report shouldn't leave others needing to chase you up for more information. Therefore, we ask you to investigate carefully, collect information and describe the issue in detail in your report. Please complete the following steps in advance to help us fix any potential bug as fast as possible.

- Make sure that you are using the latest version.
- Determine if your bug is really a bug and not an error on your side e.g. using incompatible environment components/versions (Make sure that you have read the [documentation](https://fluid-queue.dev). If you are looking for support, you might want to check [this section](#i-have-a-question)).
- To see if other users have experienced (and potentially already solved) the same issue you are having, check if there is not already a bug report existing for your bug or error in the [bug tracker](https://github.com/fluid-queue/fluid-queueissues?q=label%3Abug).
- Also make sure to search the internet (including Stack Overflow) to see if users outside of the GitHub community have discussed the issue.
- Collect information about the bug:
  - Stack trace (Traceback)
  - OS, Platform and Version (Windows, Linux, macOS, x86, ARM)
  - Version of the interpreter, compiler, SDK, runtime environment, package manager, depending on what seems relevant.
  - Possibly your input and the output
  - Can you reliably reproduce the issue? And can you also reproduce it with older versions?

<!-- omit in toc -->

#### How Do I Submit a Good Bug Report?

> You must never report security related issues, vulnerabilities or bugs including sensitive information to the issue tracker, or elsewhere in public. Github supports [privately reporting security vulnerabilities](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability); please use that process for any sensitive issues.

We use GitHub issues to track bugs and errors. If you run into an issue with the project:

- Open an [Issue](https://github.com/fluid-queue/fluid-queue/issues/new) and choose the Bug Report template.
- Explain the behavior you would expect and the actual behavior.
- Please provide as much context as possible and describe the _reproduction steps_ that someone else can follow to recreate the issue on their own. This usually includes your code. For good bug reports you should isolate the problem and create a reduced test case.
- Provide the information you collected in the previous section.

Once it's filed:

- The project team will label the issue accordingly.
- A team member will try to reproduce the issue with your provided steps. If there are no reproduction steps or no obvious way to reproduce the issue, the team will ask you for those steps and mark the issue as `needs-repro`. Bugs with the `needs-repro` tag will not be addressed until they are reproduced.
- If the team is able to reproduce the issue, it will be marked `bug`, as well as possibly other tags (such as `critical`), and the issue will be left to be [implemented by someone](#your-first-code-contribution).

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for fluid-queue, **including completely new features and minor improvements to existing functionality**. Following these guidelines will help maintainers and the community to understand your suggestion and find related suggestions.

<!-- omit in toc -->

#### Before Submitting an Enhancement

- Make sure that you are using the latest version.
- Read the [documentation](https://fluid-queue.dev) carefully and find out if the functionality is already covered, maybe by an individual configuration.
- Perform a [search](https://github.com/fluid-queue/fluid-queue/issues) to see if the enhancement has already been suggested. If it has, add a comment to the existing issue instead of opening a new one.
- Find out whether your idea fits with the scope and aims of the project. It's up to you to make a strong case to convince the project's developers of the merits of this feature. Keep in mind that we want features that will be useful to the majority of our users and not just a small subset. If you're just targeting a minority of users, consider writing an add-on/plugin library.

<!-- omit in toc -->

#### How Do I Submit a Good Enhancement Suggestion?

Enhancement suggestions are tracked as [GitHub issues](https://github.com/fluid-queue/fluid-queue/issues).

- Use a **clear and descriptive title** for the issue to identify the suggestion.
- Provide a **step-by-step description of the suggested enhancement** in as many details as possible.
- **Describe the current behavior** and **explain which behavior you expected to see instead** and why. At this point you can also tell which alternatives do not work for you.
- You may want to **include screenshots and animated GIFs** which help you demonstrate the steps or point out the part which the suggestion is related to. You can use [this tool](https://www.cockos.com/licecap/) to record GIFs on macOS and Windows, and [this tool](https://github.com/colinkeenan/silentcast) or [this tool](https://github.com/GNOME/byzanz) on Linux.
- **Explain why this enhancement would be useful** to most fluid-queue users. You may also want to point out the other projects that solved it better and which could serve as inspiration.

In addition the the Bug Report template mentioned earlier, we also have a Feature Request template you can use to help format your suggestions.

### Your First Code Contribution

#### Environment Setup

You will need to have [Node.js](https://nodejs.org) installed on your machine in order to run the bot locally, so make sure that's installed. You'll also want an editor; while you can use any text editor, we would recommend one like VS Code (with the eslint extension) for syntax highlighting and built-in linting.

Once you have Node and your editor set up, fork the repository, clone it, and create a branch to work in:

```bash
$ git clone git@github.com:your-username/fluid-queue.git
$ cd fluid-queue
$ git checkout -b your-first-contribution
```

While we recommend keeping in mind our [guidelines for branch naming](#branch-naming),

Then you'll want to install the dependencies with `npm install`. Make sure this installed eslint by running `./node_modules/.bin/eslint src`; this should return successfully with no output. You should also check to make sure prettier is installed with `npx prettier --check .` as prettier is used for enforcing formatting. Now you can open the code in your editor and make your changes!

#### Making Your Changes

As you add new functions, please consider also adding tests for those functions. If you're not sure how to work with the test framework, that's alright! But we do ask that if you can't add tests, you at least document any new functions without test coverage, so we can add tests in ourselves.

Additionally, you probably want to have a text editor or IDE with an eslint plugin, as this will save you some work later; if you can address linter errors while writing your code, rather than after all your code is written, it's a lot easier to keep eslint happy.

#### Opening a Pull Request

Once your changes have been made, please run eslint again to identify any linter or formatting errors, and address any errors it gives you. The output from eslint should be blank before you open a pull request. Similarly, please run `npm test` to run the built-in tests and confirm none are failing. We cannot merge your code until it passes both the eslint checks and the tests. Finally, run `npx prettier --write .` to run prettier on your code and ensure it's consistent with our format, and commit any changes it makes.

Once eslint and the tests are successful, commit your code to your fork, and create a pull request against the `develop` branch (you may need to [compare branches](https://github.com/fluid-queue/fluid-queue/compare) to open a pull request). Fill out the information requested in the template, open a pull request, and we'll review your contributions and provide feedback.

#### Pull Request Reviews

Once you've opened a pull request, there are two requirements before it can be merged:

1. A project member must review and approve the changes, and
2. The automated tests must pass.
   - If this is your first contribution, then we'll need to manually run the tests, but they should run automatically for anyone who's contributed previously.

We might request changes before approving the pull request. This is a pretty standard part of the process, and it's just to make sure that we keep the codebase and functionality consistent.

Once any requested changes are made, the tests pass, and a project member signs off, we'll merge your code and congratulate you on your first pull request.

### Improving The Documentation

The documentation is stored in a [separate repository](https://github.com/fluid-queue/fluid-queue.github.io), where we have a Jekyll site hosted through GitHub Pages. Contributions are welcome to this repository as pull requests!

One thing to keep in mind for the documentation site is the order of the pages, which is determined by the date put on each page. If you have a new page to add, please make sure you're dating it such that it appears in an appropriate order.

## Styleguides

Code style is enforced through eslint and prettier; when writing code, please ensure you run prettier prior to your commit and have no eslint errors.

### Commit Messages

Commit messages should have a brief heading summarizing the changes in the commit. The main body of the commit message should be a detailed (few sentence) summary of the changes. If your changes are too broad to summarize in a few sentences, consider splitting the changes up into multiple commits.

Large pull requests will be squashed and merged, and should have a more detailed commit message to cover all the changes.

In either case, remember that the commit itself shows the line-by-line changes, so while we request your commit messages be accurate and complete, they don't need to be _verbose_.

## Git Workflow

We generally follow the gitflow workflow for this project. This means a couple things:

1. We develop against the `develop` branch primarily. New features and non-urgent bugfixes should be branched from `develop` and PRs should be opened against it. The project maintainers will decide when a release is ready and start a `release` branch to prepare the release, which will be merged into `main` and a tag created.
2. Branch naming is important, as it makes it clear what kind of work is happening and whether a branch is based on `main` or `develop`.
3. Any changes that are based on `main` need to be backported to `develop` as well.

### Branch Naming

Branch names within the repository should consist of two parts: `tag/branch-name`. The tag should be a brief description of the type of work being done, and the name should be a concise description of the work being done. Tags should be a single word; names may be multiple words, separated by spaces. Starting the branch name with a tag helps to more quickly understand the purpose of a branch.

We would recommend using the following tags if possible, to maintain consistency within the repository:

- `feature`: implementation of new features
- `bugfix`: fixing a bug or regression in an existing feature; should be based on and merged into `develop`
- `hotfix`: an urgent bug fix based on and merged into `main`
- `docs`: working on the included documentation
- `refactor`: refactoring part of the codebase without intruducing a new feature or fixing any bugs
- `dev`: working on the repository's workflows, linter configuration, etc
- `archive`: scrapped features and old branches that have value as artifacts of how we handled certain things

This is not an exhaustive list of tags that can be used, however it should cover most cases.

This convention is not required for external contributors, as external branches belong to their own repositories, however we expect to follow this convention internally.

## Join The Project Team

We're a small project with a small team, but if you're an active contributor we may invite you to join the team. We look for people who are participating in development and the community, and show an understanding of our development process and how people use the bot.

To help you get to that point, once you've contributed a couple times, we can give you the contributor role on Discord. This comes with less power, but also less responsibility: it gives you the opportunity to participate in development discussions on Discord and be assigned issues and pull requests, and lets us get to know you better before adding you to the project.

<!-- omit in toc -->

## Attribution

This guide is based on the **contributing-gen**. [Make your own](https://github.com/bttger/contributing-gen)!
