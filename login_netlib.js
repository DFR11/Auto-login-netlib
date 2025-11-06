const axios = require('axios');
const { chromium } = require('playwright');

// -------------------------------
const logBuffer = [];

function log(msg) {
    console.log(msg);
    logBuffer.push(msg);
}
// -------------------------------

// Telegram 推送函数
async function sendTgLog() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
        console.log("⚠️ Telegram 未配置，跳过推送");
        return;
    }

    const now = new Date();
    const beijingNow = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // UTC+8
    const nowStr = beijingNow.toISOString().replace('T', ' ').substring(0, 19) + " UTC+8";

    const finalMsg = `📌 Netlib 保活执行日志\n🕒 ${nowStr}\n\n` + logBuffer.join("\n");

    // 分割长消息
    for (let i = 0; i < finalMsg.length; i += 3900) {
        const chunk = finalMsg.substring(i, i + 3900);
        try {
            const response = await axios.get(
                `https://api.telegram.org/bot${token}/sendMessage`,
                {
                    params: {
                        chat_id: chatId,
                        text: chunk
                    },
                    timeout: 10000
                }
            );
            
            if (response.status === 200) {
                console.log(`✅ Telegram 推送成功 [${Math.floor(i / 3900) + 1}]`);
            } else {
                console.log(`⚠️ Telegram 推送失败 [${Math.floor(i / 3900) + 1}]: HTTP ${response.status}, 响应: ${response.data}`);
            }
        } catch (error) {
            console.log(`⚠️ Telegram 推送异常 [${Math.floor(i / 3900) + 1}]: ${error.message}`);
        }
    }
}

// 从环境变量解析多个账号
function parseAccounts() {
    const accountsEnv = process.env.SITE_ACCOUNTS || "";
    const accounts = [];

    const items = accountsEnv.split(";");
    for (const item of items) {
        if (item.trim()) {
            const parts = item.split(",", 2);
            if (parts.length === 2) {
                accounts.push({
                    username: parts[0].trim(),
                    password: parts[1].trim()
                });
            } else {
                log(`⚠️ 忽略格式错误的账号项: ${item}`);
            }
        }
    }

    return accounts;
}

const failMsgs = [
    "Invalid credentials.",
    "Not connected to server.",
    "Error with the login: login size should be between 2 and 50 (currently: 1)"
];

async function loginAccount(browser, username, password) {
    log(`🚀 开始登录账号: ${username}`);
    
    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto("https://www.netlib.re/");
        await page.waitForTimeout(5000);

        await page.click('text=Login');
        await page.waitForTimeout(2000);
        
        await page.fill('input[name="username"], [name="username"], [role="textbox"][name="Username"]', username);
        await page.waitForTimeout(2000);
        
        await page.fill('input[name="password"], [name="password"], [role="textbox"][name="Password"]', password);
        await page.waitForTimeout(2000);
        
        await page.click('button:has-text("Validate"), [role="button"][name="Validate"]');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        const successText = "You are the exclusive owner of the following domains.";
        const successElement = await page.$(`text=${successText}`);
        
        if (successElement) {
            log(`✅ 账号 ${username} 登录成功`);
            await page.waitForTimeout(5000);
        } else {
            let failedMsg = null;
            for (const msg of failMsgs) {
                const failElement = await page.$(`text=${msg}`);
                if (failElement) {
                    failedMsg = msg;
                    break;
                }
            }
            
            if (failedMsg) {
                log(`❌ 账号 ${username} 登录失败: ${failedMsg}`);
            } else {
                log(`❌ 账号 ${username} 登录失败: 未知错误`);
            }
        }

        await context.close();

    } catch (error) {
        log(`❌ 账号 ${username} 登录异常: ${error.message}`);
    }
}

async function run() {
    const accounts = parseAccounts();
    
    if (accounts.length === 0) {
        log("⚠️ 未找到有效的账号配置");
        return;
    }

    const browser = await chromium.launch({ headless: true });
    
    try {
        for (const account of accounts) {
            await loginAccount(browser, account.username, account.password);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } finally {
        await browser.close();
    }
}

// 主执行函数
async function main() {
    try {
        await run();
        await sendTgLog();
    } catch (error) {
        console.error('执行过程中发生错误:', error);
        process.exit(1);
    }
}

// 如果是直接执行此文件
if (require.main === module) {
    main();
}

module.exports = {
    log,
    sendTgLog,
    parseAccounts,
    loginAccount,
    run,
    main
};
