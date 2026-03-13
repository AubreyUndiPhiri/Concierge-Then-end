# Git Integration & Wix CLI <img align="left" src="https://user-images.githubusercontent.com/89579857/185785022-cab37bf5-26be-4f11-85f0-1fac63c07d3b.png">

This repo is part of Git Integration & Wix CLI, a set of tools that allows you to write, test, and publish code for your Wix site locally on your computer. 

Connect your site to GitHub, develop in your favorite IDE, test your code in real time, and publish your site from the command line.

## Set up this repository in your IDE
This repo is connected to a Wix site. That site tracks this repo's default branch. Any code committed and pushed to that branch from your local IDE appears on the site.

Before getting started, make sure you have the following things installed:
* [Git](https://git-scm.com/download)
* [Node](https://nodejs.org/en/download/), version 14.8 or later.
* [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) or [yarn](https://yarnpkg.com/getting-started/install)
* An SSH key [added to your GitHub account](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account).

To set up your local environment and start coding locally, do the following:

1. Open your terminal and navigate to where you want to store the repo.
1. Clone the repo by running `git clone <your-repository-url>`.
1. Navigate to the repo's directory by running `cd <directory-name>`.
1. Install the repo's dependencies by running `npm install` or `yarn install`.
1. Install the Wix CLI by running `npm install -g @wix/cli` or `yarn global add @wix/cli`.  
   Once you've installed the CLI globally, you can use it with any Wix site's repo.

For more information, see [Setting up Git Integration & Wix CLI](https://support.wix.com/en/article/velo-setting-up-git-integration-wix-cli-beta).

## Write Velo code in your IDE
Once your repo is set up, you can write code in it as you would in any other non-Wix project. The repo's file structure matches the [public](https://support.wix.com/en/article/velo-working-with-the-velo-sidebar#public), [backend](https://support.wix.com/en/article/velo-working-with-the-velo-sidebar#backend), and [page code](https://support.wix.com/en/article/velo-working-with-the-velo-sidebar#page-code) sections in Editor X.

Learn more about [this repo's file structure](https://support.wix.com/en/article/velo-understanding-your-sites-github-repository-beta).

## Test your code with the Local Editor
The Local Editor allows you test changes made to your site in real time. The code in your local IDE is synced with the Local Editor, so you can test your changes before committing them to your repo. You can also change the site design in the Local Editor and sync it with your IDE.

Start the Local Editor by navigating to this repo's directory in your terminal and running `wix dev`.

For more information, see [Working with the Local Editor](https://support.wix.com/en/article/velo-working-with-the-local-editor-beta).

## Preview and publish with the Wix CLI
The Wix CLI is a tool that allows you to work with your site locally from your computer's terminal. You can use it to build a preview version of your site and publish it. You can also use the CLI to install [approved npm packages](https://support.wix.com/en/article/velo-working-with-npm-packages) to your site.

Learn more about [working with the Wix CLI](https://support.wix.com/en/article/velo-working-with-the-wix-cli-beta).

## Invite contributors to work with you
Git Integration & Wix CLI extends Editor X's [concurrent editing](https://support.wix.com/en/article/editor-x-about-concurrent-editing) capabilities. Invite other developers as collaborators on your [site](https://support.wix.com/en/article/inviting-people-to-contribute-to-your-site) and your [GitHub repo](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository). Multiple developers can work on a site's code at once.



## **Database Collection Schema Reference**

To successfully rebuild or maintain the Nkhosi Livingstone Lodge database, create the following five collections in the Wix Content Manager with the specified fields.

1. PendingRequests
This is the core operational collection used for real-time order tracking and staff fulfillment.

clientName (Text): The name of the guest or "Lodge Guest".

roomNumber (Text): Numeric room ID (e.g., "1", "2").

roomName (Text): The traditional Zambian name assigned to the room.

requestType (Text): The department responsible (Kitchen, Spa, Activities, or Drivers).

details (Text): Specifics of the order or request.

orderTotal (Number): Calculated total in Kwacha (K).

status (Text): Defaults to "Pending Verification" until fulfilled.

paymentStatus (Text): Set to "PAID" upon successful transaction.

email (Text): Guest email used for dashboard mapping and notifications.

fullContext (Text): Raw message or AI-generated response for record-keeping.

isPrinted (Boolean): Tracking flag for fulfilled/archived tasks.

emailSent (Boolean): Indicates if the "Order Ready" notification was dispatched.

timestamp (Date): Time the request was initially submitted.

2. StaffProfiles
Used for dashboard authentication and department-based order routing.

email (Text): Unique work email (Primary ID).

password (Text): Access code/pin for dashboard login.

firstName (Text): Staff member's name.

roles (Tags/Array): Assigned departments (e.g., ["Kitchen", "Admin"]).

enrolledAt (Date): Registration date.

3. LodgeSettings
Stores dynamic data used by the AI to provide up-to-date information to guests.

title (Text): Configuration ID (e.g., "DailyAvailability", "ActivitiesPrices", "DriverInfo").

unavailableText (Text): The actual context/overrides provided to the AI model.

lastUpdatedBy (Text): Name of the staff member who last synced the data.

4. ConciergeFeedback
Collects guest reviews to generate performance analytics.

rating (Number): Numeric score provided by the guest.

comment (Text): Qualitative feedback.

5. ChatHistory
Used to maintain conversation context for the AI during active sessions.

role (Text): Either "user" or "assistant".

content (Text): The text of the specific message.

Note: Ensure that suppressAuth: true is utilized in backend queries for these collections to allow the custom Staff Dashboard and AI Bridge to interact with data regardless of the active site visitor's permissions.
