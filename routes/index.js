var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  // res.render('index', { title: 'KaiserhofInvoVis' });
  res.location('/kaiserhof').status(301).send();
});

module.exports = router;
