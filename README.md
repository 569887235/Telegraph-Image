# Telegraph-Image

Free Image Hosting solution, Flickr/imgur alternative. Using Cloudflare Pages and the Telegram Bot API (Telegram Channel).

English|[中文](README-zh.md)

> [!IMPORTANT]
>
> Since the original Telegraph API interface was closed by the official, you need to switch the upload channel to Telegram Channel. Please set `TG_ACCOUNTS_JSON` according to the deployment requirements in the documentation, otherwise upload and file access will not work properly.

## How to Obtain Telegram `Bot_Token` and `Chat_ID`

If you don't have a Telegram account yet, please create one first. Then, follow these steps to get the `BOT_TOKEN` and `CHAT_ID`:

1. **Get the `Bot_Token`**
   - In Telegram, send the command `/newbot` to [@BotFather](https://t.me/BotFather), and follow the prompts to input your bot's name and username. Once successfully created, you will receive a `BOT_TOKEN`, which is used to interact with the Telegram API.

![202409071744569](https://github.com/user-attachments/assets/04f01289-205c-43e0-ba03-d9ab3465e349)

2. **Set the bot as a channel administrator**
   - Create a new channel (Channel), enter the channel and select channel settings. Add the bot you just created as a channel administrator, so it can send messages.

![202409071758534](https://github.com/user-attachments/assets/cedea4c7-8b31-42e0-98a1-8a72ff69528f)

![202409071758796](https://github.com/user-attachments/assets/16393802-17eb-4ae4-a758-f0fdb7aaebc4)


3. **Get the `Chat_ID`**
   - Get your channel ID through [@VersaToolsBot](https://t.me/VersaToolsBot). Send a message to this bot and follow the instructions to receive your `CHAT_ID` (the ID of your channel).
   - Or get your channel ID through [@GetTheirIDBot](https://t.me/GetTheirIDBot). Send a message to this bot and follow the instructions to receive your `CHAT_ID` (the ID of your channel).

   ![202409071751619](https://github.com/user-attachments/assets/59fe8b20-c969-4d13-8d46-e58c0e8b9e79)

Finally, go to the Cloudflare Pages backend to set the relevant environment variables (Note: After modifying environment variables, you need to redeploy for the changes to take effect)
| Environment Variable | Example Value              | Description                                                                            |
|---------------------|---------------------------|----------------------------------------------------------------------------------------|
| `TG_ACCOUNTS_JSON`  | `{"main":{"botToken":"123468:AAxxxGKrn5","chatId":"-1234567"}}` | Top-level JSON object keyed by storage account key. Each account must include `botToken` and `chatId`. |
| `DEFAULT_STORAGE_ACCOUNT_KEY` | `main` | Optional default account used by `/upload` and legacy `/file/{token}.{ext}` links; defaults to `main`. |

## How to Deploy

### Preparation

The only thing you need to prepare in advance is a Cloudflare account (If you need to deploy on your own server without relying on Cloudflare, please refer to [#46](https://github.com/cf-pages/Telegraph-Image/issues/46))

### Step by Step Tutorial

3 simple steps to deploy this project and have your own image hosting

1. Fork this repository (Note: You must deploy using Git or Wrangler CLI tool for it to work properly, [Documentation](https://developers.cloudflare.com/pages/functions/get-started/#deploy-your-function))

2. Open the Cloudflare Dashboard, enter the Pages management page, select Create Project, then choose `Connect to Git provider`

![1](https://telegraph-image.pages.dev/file/8d4ef9b7761a25821d9c2.png)

3. Follow the prompts on the page to enter the project name, select the git repository you need to connect to, then click `Deploy site` to complete the deployment

## Features

1. Unlimited image storage, you can upload an unlimited number of images

2. No need to purchase a server, hosted on Cloudflare's network. When usage does not exceed Cloudflare's free quota, it's completely free

3. No need to purchase a domain name, you can use the free second-level domain `*.pages.dev` provided by Cloudflare Pages, and also supports binding custom domain names

4. Supports Telegram Bot API storage with configurable multi-channel access.

### Bind Custom Domain

In the custom domain section of Pages, bind a domain name that exists in Cloudflare. For domain names hosted in Cloudflare, DNS records will be automatically modified
![2](https://telegraph-image.pages.dev/file/29546e3a7465a01281ee2.png)

### Limitations

1. Uploaded images are sent via the Telegram Bot API and stored on Telegram's servers. Telegram currently limits files sent by bots to a maximum size of 50MB per file; uploads larger than this will fail

2. Due to the use of Cloudflare's network, image loading speed may not be guaranteed in some regions

3. The free version of Cloudflare Function is limited to 100,000 requests per day (i.e., the total number of uploads or image loads cannot exceed 100,000). If exceeded, you may need to purchase the paid plan of Cloudflare Function.

### Thanks

Ideas and code provided by Hostloc @feixiang and @乌拉擦

## Update Log
July 6, 2024 - Backend Management Page Update

- Support for two new management page views (Grid view and Waterfall view)

    1. Grid view, thanks to @DJChanahCJD for the submitted code
        Supports batch delete/copy links
        Supports sorting in reverse chronological order
        Supports pagination
        ![](https://camo.githubusercontent.com/a0551aa92f39517f0b30d86883882c1af4c9b3486e540c7750af4dbe707371fa/68747470733a2f2f696d6774632d3369312e70616765732e6465762f66696c652f6262616438336561616630356635333731363237322e706e67)
    2. Waterfall view, thanks to @panther125 for the submitted code
        ![](https://camo.githubusercontent.com/63d64491afc5654186248141bd343c363808bf8a77d3b879ffc1b8e57e5ac85d/68747470733a2f2f696d6167652e67696e636f64652e6963752f66696c652f3930346435373737613363306530613936623963642e706e67)

- Added automatic update support

    Now forked projects can automatically sync with the upstream repository to automatically install the latest project features, thanks to @bian2022

    Steps to enable automatic updates:
        After you fork the project, due to Github's limitations, you need to manually go to the Actions page of your forked project to enable Workflows, and enable Upstream Sync Action. Once enabled, automatic updates will occur hourly:
        ![](https://im.gurl.eu.org/file/f27ff07538de656844923.png)
        ![](https://im.gurl.eu.org/file/063b360119211c9b984c0.png)
    `If you encounter Upstream Sync execution errors, please manually Sync Fork once!`

    Manually update code

    If you want to manually update immediately, you can check [Github's documentation](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork) to learn how to sync your forked project with upstream code.

    You can star/watch this project or follow the author to receive notifications of new feature updates.
- Added remote telemetry

    You can opt out of telemetry by adding the `disable_telemetry` environment variable

January 18, 2023 - Image Management Feature Update

The KV-backed image management, blacklist/whitelist, moderation metadata, and legacy admin pages have been removed from this branch. Upload and file access are stateless Cloudflare Pages Functions backed by Telegram Bot API configuration only.

## How to Update if Already Deployed?

Set the required Cloudflare Pages environment variables, then go to your forked repository and select `Sync fork` -> `Update branch`. Cloudflare Pages will deploy the latest code after it detects the repository update.

### Sponsorship

This project is tested with BrowserStack.

This project is support by [Cloudflare](https://www.cloudflare.com/).
