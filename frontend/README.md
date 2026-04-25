# Frontend

Add your Angular app here when you are ready. From the repository root, one common approach:

```bash
cd frontend
npx @angular/cli new . --routing --style=css --ssr=false --skip-git
```

Use flags that match what you want to learn (routing, styles, etc.). If the CLI does not allow `.` as the project name in your version, create a subfolder or use `ng new my-app` and move files afterward.

Later you can point the Angular dev server at your Node API (proxy or environment) once the backend exists.
