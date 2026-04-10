# 7roof Project

Modern gaming portal with integrated buzzer system.

## Deployment to Railway via GitHub

To link this project to your Railway account using GitHub (`rakaga`), follow these steps:

1.  **Initialize Git:**
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    ```

2.  **Create GitHub Repository:**
    - Go to GitHub and create a new repository named `7roof`.
    - Link it to your local project:
    ```bash
    git remote add origin https://github.com/rakaga/7roof.git
    git branch -M main
    git push -u origin main
    ```

3.  **Connect to Railway:**
    - Log in to [Railway.app](https://railway.app/).
    - Click **"New Project"** -> **"Deploy from GitHub repo"**.
    - Select your `7roof` repository.
    - Railway will automatically detect the project and deploy it.

## Buzzer System
The buzzer system is already configured to connect to the backend at `https://buzzer-server-production-8b8a.up.railway.app/`.
