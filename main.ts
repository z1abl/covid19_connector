/**
 * COVID-19 Data Studio connector.
 * Imports data from: https://covid19api.com into Data Studio.
 * This version is based on free API plan, which doesn't require token.
 * Limitations can cause that not all selected countries will be imported.
 * If selected country is visible in connector it means that it was fully imported
 * otherwise it was not imported at all.
 */

import "google-apps-script";

const DOMAIN = 'https://api.covid19api.com';
const COUNTRIES_URL = `${DOMAIN}/countries`;

// https://documenter.getpostman.com/view/10808728/SzS8rjbc#4b88f773-be9b-484f-b521-bb58dda0315c
const DAY_ONE_URL = `${DOMAIN}/dayone/country`;
const MAX_CACHE = 102400; //100 KB
const EXPIRATION = 21600; //seconds

function getConfig(request) {
  let cc = DataStudioApp.createCommunityConnector();
  let config = cc.getConfig();
  // countries in UI, which a user can select for importing
  let countries = getCountries().map(item => [item['Slug'], item['Country']]);
  countries.sort();
  countries.forEach(country => config.newCheckbox().setAllowOverride(true).setId(country[0]).setName(country[1]));
  return config.build();
}

function getAuthType(request) {
  let cc = DataStudioApp.createCommunityConnector();
  return cc.newAuthTypeResponse()
  .setAuthType(cc.AuthType.NONE)
  .build();
}


function getSchema(request) {
  console.log(request);
  if (!request.configParams || !Object.entries(request.configParams).filter(x => x[1]).map(y => y[0]).length) {
    throwDsException('Select at least one country.');
  }
  return {
    schema: [
      {
        name: 'country',
        label: 'Country',
        dataType: 'STRING',
        semantics: {
          conceptType: 'DIMENSION'
        }
      },
      {
        name: 'country_code',
        label: 'Country code',
        dataType: 'STRING',
        semantics: {
          conceptType: 'DIMENSION',
        },
      },
      {
        name: 'confirmed',
        label: 'Confirmed',
        dataType: 'NUMBER',
        semantics: {
          conceptType: 'DIMENSION',
        },
      },
      {
        name: 'deaths',
        label: 'Deaths',
        dataType: 'NUMBER',
        semantics: {
          conceptType: 'DIMENSION',
        },
      },
      {
        name: 'recovered',
        label: 'Recovered',
        dataType: 'NUMBER',
        semantics: {
          conceptType: 'DIMENSION',
        },
      },
      {
        name: 'active',
        label: 'Active',
        dataType: 'NUMBER',
        semantics: {
          conceptType: 'DIMENSION',
        },
      },
      {
        name: 'date',
        label: 'Date',
        dataType: 'STRING',
        semantics: {
          conceptType: 'DIMENSION',
          semanticGroup: 'DATETIME',
          semanticType: 'YEAR_MONTH_DAY'
        }
      }
    ]
  };
}

function isAdminUser(request) {
  return true;
}

// returns the list of countries
function getCountries(){
  let response;
  let parsedResponse;

  try {
    response = UrlFetchApp.fetch(COUNTRIES_URL).getContentText();
    parsedResponse = JSON.parse(response);
  } catch (e){
    throwDsException('Error in countries request. Try again later.');
  }
  return parsedResponse;
}

function getDataByCountry(country){
  let options = {
    'muteHttpExceptions': true
  }
  let response;
  try {
    response = UrlFetchApp.fetch(`${DAY_ONE_URL}/${country}`,options);
    if (response.getResponseCode() < 300) {
      return response.getContentText();
    } 
  } catch (e) {
    console.log('Error while country data parsing:'+e);
    return;
  }
}


function getAllData(countries){
  let countriesFromConfig = countries;
  let cache = CacheService.getUserCache();
  let notCachedResults = [];
  for (let i=0; i<countriesFromConfig.length; i++){
    let country = countriesFromConfig[i];
    if (cache.get(country)){
      continue;
    }
    
    let countriesData = getDataByCountry(country);
    // responses with a size <= 100 KB are inserted into a cache to decrease the quantity of API-requests
    if (countriesData) {
      if (countriesData.length <= MAX_CACHE) {
        cache.put(country, countriesData,EXPIRATION);
      } else {
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(countriesData);
        } catch (e) {
          console.log(e);
          continue;
        }
        // in case if response was in JSON but it's not array with results
        // i.e.: {"message":"Not Found"}
        if (Array.isArray(parsedResponse)) {
          notCachedResults.push(parsedResponse);
        }
      }  
    }
  }
  // cached + non-cached results in one array (all data)
  return Object.values(cache.getAll(countriesFromConfig)).map(country => JSON.parse(country)).flat().concat(notCachedResults.flat());
}

function getData(request){
  // { poland: true, vanuatu: true, 'germany': false } - filters only with 'true'
  let countries = Object.entries(request.configParams).filter(country => country[1]).map(country => country[0]);
  let dataSchema = [];
  let fixedSchema = getSchema(request).schema;
  request.fields.forEach(function(field) {
    for (let i = 0; i < fixedSchema.length; i++) {
      if (fixedSchema[i].name == field.name) {
        dataSchema.push(fixedSchema[i]);
      }
    }
  });
  
  let parsedResponse = getAllData(countries);
  if (!parsedResponse) {
    throwDsException('Empty result.');
  }

  let data = [];
  parsedResponse.forEach(function(item) {
    let values = [];
    dataSchema.forEach(function(field) {
      if (field.name == 'country') {
        values.push(item['Country'])
      } else if (field.name == 'country_code') {
        values.push(item['CountryCode'])
      } else if (field.name == 'confirmed') {
        values.push(item['Confirmed'])
      } else if (field.name == 'deaths') {
        values.push(item['Deaths'])
      } else if (field.name == 'recovered') {
        values.push(item['Recovered'])
      } else if (field.name == 'active') {
        values.push(item['Active'])
      } else if (field.name == 'date') {
        let date = item['Date'];
        let parsedDate = Utilities.formatDate(new Date(date), "GMT", "yyyyMMdd");
        values.push(parsedDate);
      }
    });

    data.push({
      values: values
    });
  });

return {
    schema: dataSchema,
    rows: data
  };
}

function throwDsException(text){
  DataStudioApp.createCommunityConnector()
  .newUserError()
  .setText(`${text}`)
  .throwException();
}

function removeUserCache() {
  let cache = CacheService.getUserCache();
  cache.removeAll(getCountries().map(item => item['Slug']));
}