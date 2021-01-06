import 'google-apps-script';


QUnit.helpers( this );
function testFunction() {
  testingCovidConnector();
}
 
function doGet( e ) {
     QUnit.urlParams( e.parameter );
     QUnit.config({
          title: "QUnit for Covid Data Studio Connector" 
     });
     QUnit.load( testFunction );
 
     return QUnit.getHtml();
}
 
function testingCovidConnector(){
   QUnit.test( "testing", function() {
      equal(getDataByCountry('polan'),undefined,'broken getDataByCountry');
      equal(typeof(getDataByCountry('poland')),'string','valid getDataByCountry');
      equal(typeof(getCountries()),'object','valid getCountries');
      equal(typeof(getAllData(['poland','france','germany'])),'object','valid getAllData');
      equal(removeUserCache(),undefined,'removeUserCache');
   });
}

