# kaiserhofinfovis

### Setup

1) Execute `npm install`
2) To run project: `npm start`
3) Run website in browser `http://localhost:3000/`

---
### Options (not needed for tutors)

#### Config file

```
{
  "host": "www.yourdatabasedomain.org",
  "port": 3306,
  "user": "username",
  "password": "yourpassword",
  "database": "kaiserhofinfovis"
}
```

#### Visualisations
The visualisations can be modified under `public/kaiserhof/kaiserhof.js`

#### SASS
To automatically update css files from sass (.scss) open new terminal and call `npm run scss`.

#### Database
To visualize the pictures of the persons in the family tree, 
you have to convert the image website urls to direct source urls by calling `http://localhost:3000/api/extractPersonImageSource`. 
This can take a while.

### Contributors

- Alexander Hiesinger
- Sophia Münch
- Daria Fakhrutdinova
- August Oberhauser

LMU Munich