# Telegraph-Image

免费图片托管解决方案，Flickr/imgur 替代品。基于 Cloudflare Pages，使用 Telegram Bot API 进行图片上传与存储（原 Telegraph 接口已下线）。

[English](README.md)|中文

> [!IMPORTANT]
>
> 由于原有的Telegraph API接口被官方关闭，需要将上传渠道切换至Telegram Channel，请按照文档中的部署要求设置`TG_ACCOUNTS_JSON`，否则上传和文件访问将无法正常使用。

## 如何获取Telegram的`Bot_Token`和`Chat_ID`

如果您还没有Telegram账户，请先创建一个。接着，按照以下步骤操作以获取`BOT_TOKEN`和`CHAT_ID`：

1. **获取`Bot_Token`**
   - 在Telegram中，向[@BotFather](https://t.me/BotFather)发送命令`/newbot`，根据提示依次输入您的机器人名称和用户名。成功创建机器人后，您将会收到一个`BOT_TOKEN`，用于与Telegram API进行交互。
   
![202409071744569](https://github.com/user-attachments/assets/04f01289-205c-43e0-ba03-d9ab3465e349)

2. **设置机器人为频道管理员**
   - 创建一个新的频道（Channel），进入该频道后，选择频道设置。将刚刚创建的机器人添加为频道管理员，这样机器人才能发送消息。

![202409071758534](https://github.com/user-attachments/assets/cedea4c7-8b31-42e0-98a1-8a72ff69528f)
   
![202409071758796](https://github.com/user-attachments/assets/16393802-17eb-4ae4-a758-f0fdb7aaebc4)


3. **获取`Chat_ID`**
   - 通过[@VersaToolsBot](https://t.me/VersaToolsBot)获取您的频道ID。向该机器人发送消息，按照指示操作，最后您将得到`CHAT_ID`（即频道的ID）。
   - 或者通过[@GetTheirIDBot](https://t.me/GetTheirIDBot)获取您的频道ID。向该机器人发送消息，按照指示操作，最后您将得到`CHAT_ID`（即频道的ID）。

   ![202409071751619](https://github.com/user-attachments/assets/59fe8b20-c969-4d13-8d46-e58c0e8b9e79)

最后去Cloudflare Pages后台设置相关的环境变量（注：修改环境变量后，需要重新部署才能生效）
| 环境变量        | 示例值                    | 说明                                                                                   |
|-----------------|---------------------------|----------------------------------------------------------------------------------------|
| `TG_ACCOUNTS_JSON` | `{"main":{"botToken":"123468:AAxxxGKrn5","chatId":"-1234567"}}` | 顶层 JSON 对象，key 为存储账号标记；每个账号必须包含 `botToken` 和 `chatId`。 |
| `DEFAULT_STORAGE_ACCOUNT_KEY` | `main` | 可选默认账号，用于 `/upload` 和旧格式 `/file/{token}.{ext}` 链接；默认 `main`。 |
| `REDIRECT_URL` | `https://example.com/` | 可选页面重定向目标。设置后，HTML 页面访问会重定向到该地址；上传、文件、API 和静态资源路径保持正常访问。 |

## 如何部署

### 提前准备

你唯一需要提前准备的就是一个 Cloudflare 账户 （如果需要在自己的服务器上部署，不依赖 Cloudflare，可参考[#46](https://github.com/cf-pages/Telegraph-Image/issues/46) ）

### 手把手教程

简单 3 步，即可部署本项目，拥有自己的图床

1.Fork 本仓库 (注意：必须使用 Git 或者 Wrangler 命令行工具部署后才能正常使用，[文档](https://developers.cloudflare.com/pages/functions/get-started/#deploy-your-function))

2.打开 Cloudflare Dashboard，进入 Pages 管理页面，选择创建项目，选择`连接到 Git 提供程序`

![1](https://telegraph-image.pages.dev/file/8d4ef9b7761a25821d9c2.png)

3. 按照页面提示输入项目名称，选择需要连接的 git 仓库，点击`部署站点`即可完成部署

## 特性

1.无限图片储存数量，你可以上传不限数量的图片

2.无需购买服务器，托管于 Cloudflare 的网络上，当使用量不超过 Cloudflare 的免费额度时，完全免费

3.无需购买域名，可以使用 Cloudflare Pages 提供的`*.pages.dev`的免费二级域名，同时也支持绑定自定义域名

4.支持 Telegram Bot API 存储，并可配置多频道访问。

### 绑定自定义域名

在 pages 的自定义域里面，绑定 cloudflare 中存在的域名，在 cloudflare 托管的域名，自动会修改 dns 记录
![2](https://telegraph-image.pages.dev/file/29546e3a7465a01281ee2.png)

### 限制

1.目前图片文件通过 Telegram Bot API 上传并存储于 Telegram，单个文件大小受 Telegram Bot API 限制（通常不超过 50MB，具体以上游 Telegram 官方文档为准）

2.由于使用 Cloudflare 的网络，图片的加载速度在某些地区可能得不到保证

3.Cloudflare Function 免费版每日限制 100,000 个请求（即上传或是加载图片的总次数不能超过 100,000 次）如超过可能需要选择购买 Cloudflare Function 的付费套餐

### 感谢

Hostloc @feixiang 和@乌拉擦 提供的思路和代码

## 更新日志
2024 年 7 月 6 日--后台管理页面更新

- 支持两个新的管理页面视图（网格视图和瀑布流）

    1、网格视图，感谢@DJChanahCJD 提交的代码
        支持批量删除/复制链接
        支持按时间倒序排序
        支持分页功能
        ![](https://camo.githubusercontent.com/a0551aa92f39517f0b30d86883882c1af4c9b3486e540c7750af4dbe707371fa/68747470733a2f2f696d6774632d3369312e70616765732e6465762f66696c652f6262616438336561616630356635333731363237322e706e67)
    2、瀑布流视图，感谢@panther125 提交的代码
        ![](https://camo.githubusercontent.com/63d64491afc5654186248141bd343c363808bf8a77d3b879ffc1b8e57e5ac85d/68747470733a2f2f696d6167652e67696e636f64652e6963752f66696c652f3930346435373737613363306530613936623963642e706e67)

- 添加自动更新支持

    现在fork的项目能够自动和上游仓库同步最新的更改，自动实装最新的项目功能，感谢 @bian2022

    打开自动更新步骤：
        当你 fork 项目之后，由于 Github 的限制，需要手动去你 fork 后的项目的 Actions 页面启用 Workflows，并启用 Upstream Sync Action，启用之后即可开启每小时定时自动更新：
        ![](https://im.gurl.eu.org/file/f27ff07538de656844923.png)
        ![](https://im.gurl.eu.org/file/063b360119211c9b984c0.png)
    `如果你遇到了 Upstream Sync 执行错误，请手动 Sync Fork 一次！`

    手动更新代码

    如果你想让手动立即更新，可以查看 [Github 的文档](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork) 了解如何让 fork 的项目与上游代码同步。

    你可以 star/watch 本项目或者 follow 作者来及时获得新功能更新通知。
- 添加远端遥测

    可通过添加`disable_telemetry`环境变量退出遥测

2023 年 1 月 18 日--图片管理功能更新

本分支已移除基于 KV 的图片管理、黑白名单、审核元数据和旧后台页面。上传与文件访问现在是无状态的 Cloudflare Pages Functions，只依赖 Telegram Bot API 配置。

## 已经部署了的，如何更新？

先进入 Cloudflare Pages 后台设置所需环境变量，然后去到你 fork 过的仓库依次选择 `Sync fork` -> `Update branch`。Cloudflare Pages 检测到仓库更新后会自动部署最新代码。

### 赞助

本项目由 BrowserStack 提供测试支持。

本项目由 [Cloudflare](https://www.cloudflare.com/) 提供支持。
