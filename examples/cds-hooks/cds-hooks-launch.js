/* eslint import/no-extraneous-dependencies: ['error', {'devDependencies': true}] */
/* eslint no-console: 0, import/no-unresolved: 0 */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa')
const simpleOauthModule = require('simple-oauth2');
const Client = require('../../lib/client');

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

  // Retrieve the JWKS and filter for potential signing keys.
  // Extract the JWT from the request's authorization header.
  // Decode the JWT and grab the kid property from the header.
  // Find the signing key in the filtered JWKS with a matching kid property.
  // Using the x5c property build a certificate which will be used to verify the JWT signature.


// NOTE: To use against a secured server, uncomment lines 17-20 below.
// app.use(jwt({
//   secret: '<CLIENT_SECRET>',
//   credentialsRequired: false
// }));

app.use(jwt({
  // Dynamically provide a signing key based on the kid in the header and the singing keys provided by the JWKS endpoint.
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: 'https://sb-auth.smarthealthit.org/jwk'
  }),

  // Validate the audience and the issuer.
  audience: 'urn:my-resource-server',
  issuer: 'https://sb-auth.smarthealthit.org/',
  algorithms: [ 'RS256' ]
}));











/**
 * This is an example of a SMART app responding to CDS Hooks requests from an EHR.
 *
 * In this example, there are two routes:
 *  - /cds-services
 *  - /cds-services/patient-view
 *
 * The EHR will call the cds-services route (the "discovery endpoint")
 * in order to configure any available CDS services for this SMART application.
 *
 * Based on this configuration, the EHR may then post to /cds-services/patient-view
 * with FHIR authorization details (i.e., access_token and scope) and prefetch data
 * as prescribed by the cds-services discovery route. The provided access token may
 * then be used by the FHIR client for further requests, as seen in the MedicationOrder example
 * (though the CDS service may operate via prefetch data alone if desired).
 *
 */
app.get('/cds-services', async (req, res) => (
  res.status(200).json({
    services: [
      {
        enabled: 'true',
        hook: 'patient-view',
        id: 'patient-view',
        name: 'Patient Greeter with Med Count',
        title: 'Patient Greeter with Med Count',
        description: 'Example of CDS service greeting patient based on prefetch and counting meds with FHIR Kit client.',
        prefetch: {
          patientToGreet: 'Patient/{{Patient.id}}',
        },
      },
    ],
  })
));

app.post('/cds-services/patient-view', async (req, res) => {
  const { fhirServer, fhirAuthorization } = req.body;

  const tokenObject = {
    access_token: fhirAuthorization.access_token,
    expires_in: fhirAuthorization.expires_in,
    scope: fhirAuthorization.scope,
  };

  const fhirClient = new Client({ baseUrl: fhirServer });
  const { authorizeUrl } = await fhirClient.smartAuthMetadata();

  console.log(`${authorizeUrl.protocol}//${authorizeUrl.host}`);
  console.log(authorizeUrl.pathname);

  // Create a new oAuth2 object using the Client capability statement:
  const oauth2 = simpleOauthModule.create({
    client: {
      id: '<CLIENT_ID>',
      secret: '<CLIENT_SECRET>',
    },
    auth: {
      tokenHost: fhirServer,
      authorizeHost: `${authorizeUrl.protocol}//${authorizeUrl.host}`,
      authorizePath: authorizeUrl.pathname,
    },
  });

  try {
    // Create the access token wrapper
    const { token } = oauth2.accessToken.create(tokenObject);

    console.log('The token is : ', token);

    fhirClient.bearerToken = token.access_token;

    const medOrders = await fhirClient.search({ resourceType: 'MedicationOrder', searchParams: { patient: req.body.patient } });

    return res.status(200).json({
      cards: [
        {
          summary: `Hello ${req.body.prefetch.patientToGreet.resource.name[0].given[0]}! You have ${medOrders.total} medication orders on file.`,
          source: {
            label: 'Patient greeting and med count service',
          },
          indicator: 'info',
          suggestions: [],
          links: [],
        },
      ],
      decisions: [],
    });
  } catch (error) {
    console.error('Access Token Error', error.message);
    return res.status(500).json('Authentication failed');
  }
});

app.listen(3000, () => {
  console.log('Express server started on port 3000');
});
