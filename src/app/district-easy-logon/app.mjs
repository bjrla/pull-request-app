import puppeteer from "puppeteer";
import clipboardy from "clipboardy";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

import { applications } from "./applications.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RETRY_COUNT = 5;

const userId = process.argv[2]?.trim() || "4A1137";
const password = process.argv[3]?.trim() || "454545";
const expirationTime = 420;
const expirationTimeInMs = expirationTime * 60 * 1000;
const startTime = Date.now();
let intervalId;

async function run() {
  let success = false;
  let retries = 1;
  while (!success && retries <= RETRY_COUNT) {
    try {
      console.log(`Starting login attempt ${retries} of ${RETRY_COUNT}`);
      await easyLogon();
      success = true;
    } catch (err) {
      console.log(`Logon attempt ${retries} failed`, err);
      retries++;
    }
  }
}

run();

async function easyLogon() {
  console.log("Starting log on...");
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate the page to a URL.
  await page.goto("https://syst-district.danskebank.com/Logon", {
    waitUntil: "networkidle2",
  });

  console.log("Filling in credentials...");
  // Type into First Logon box.
  await page.locator('[name="LogonStep1UserID"]').fill(userId);
  await page.locator('[name="LogonStep1Password"]').fill(password);
  await page.waitForSelector('[data-at-id="eSafeID_ContinueButton"]');

  // Wait and click on first result.
  await page.locator('[data-at-id="eSafeID_ContinueButton"]').click();
  console.log("Working...");

  // Wait for the next element to be available
  await page.waitForSelector("#VASCODPGO3");
  await page.locator("#VASCODPGO3").click();
  console.log("Still working...");

  // Wait for the next element to be available
  await page.waitForSelector('[name="LogonStep2Input"]');
  await page.locator('[name="LogonStep2Input"]').fill(password);
  await page.locator("#GO3_Continue").click();
  await page.waitForResponse(
    "https://syst-userapi2.danskebank.com/syst/syst-external-unauthenticated/Login/v6/BusinessOnlineBasedToken"
  );

  console.log(`User ${userId} landed to District Dashboard`);

  let districtJwt = null;
  page.on("response", async (response) => {
    if (
      response.url() ===
        "https://syst-userapi2.danskebank.com/syst/syst-external-unauthenticated/Login/v6/BusinessOnlineBasedToken" &&
      response.request().method() === "GET"
    ) {
      success("Login successful: Reading District JWT for user:", userId);

      try {
        districtJwt = await response.json();
        const cookies = await page.cookies();
        console.log("Reading User_Session Cookie for user:", userId);
        const userSessionCookie = cookies.find(
          (cookie) => cookie.name === "User_Session"
        );

        console.log("Extending session for user:", userId);

        intervalId = setInterval(() => keepAlive(page), 60000);

        section("\n\n", "Token:");
        console.log(districtJwt.token);
        section("\n\n", "User session Cookie:");
        console.log(userSessionCookie.value, "\n");
        replaceTokens(districtJwt.token);
        clipboardy.writeSync(districtJwt.token);
        success("\nToken copied to clipboard + logged in console");
      } catch (error) {
        console.error("Error parsing response:", error);
        await browser.close();
      }
    }
  });
}

const replaceTokens = (newToken) => {
  applications.forEach((application) => {
    const tokenRegex = new RegExp(
      `(${application.tokenProperty}:(\\r?\\n*).*')(.*?)'`
    );
    const envPath = path.join(__dirname, application.path);

    try {
      let envFile = fs.readFileSync(envPath, "utf8");
      envFile = application.customReplacer
        ? application.customReplacer(newToken, envFile)
        : envFile.replace(tokenRegex, `$1${newToken}'`);
      fs.writeFileSync(envPath, envFile);
      console.log(
        `[${application.appName}] REPLACED token in file: ${
          application.path
        } using ${
          application.customReplacer
            ? "custom replacer"
            : application.tokenProperty
        }`
      );
    } catch (error) {
      console.log(
        `ERROR!    Could not replace token for: '${application.appName}'. Check path and tokenProperty.`
      );
    }
  });
};

const keepAlive = async (page) => {
  try {
    const moves = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    await page.mouse.move(randomMove.x, randomMove.y);
    await page.mouse.down();
    await page.mouse.up();

    console.log("Extended user session:", userId);
    if (Date.now() - startTime >= expirationTimeInMs) {
      clearInterval(intervalId);
      console.log(
        "Stopped session validation after expiration time:",
        expirationTimeInMs
      );
      await browser.close();
    }
  } catch (error) {
    console.error("Error during session validation:", error);
    clearInterval(intervalId);
    await browser.close();
  }
};

const success = (...str) => console.log(chalk.green(...str));
const section = (...str) => console.log(chalk.bgBlue.white.green(...str));
