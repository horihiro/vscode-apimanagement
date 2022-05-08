/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HttpOperationResponse, ServiceClient } from "@azure/ms-rest-js";
import { TokenCredentialsBase } from "@azure/ms-rest-nodeauth";
import { TokenResponse } from "adal-node";
import { createGenericClient } from "vscode-azureextensionui";
import { nonNullValue } from "../../utils/nonNull";

export class GraphService {
    private accessToken: string;
    constructor(private credentials: TokenCredentialsBase, 
        private graphEndpoint: string = 'https://graph.microsoft.com') {}
    
    public async acquireGraphToken() {
        let token = await  this.credentials.getToken();
        this.credentials.authContext.acquireToken(this.graphEndpoint, 
            nonNullValue(token.userId), 
            this.credentials.clientId,  
            (error, response) => {
                if (!error) {
                    this.accessToken = (response as TokenResponse).accessToken
                }
            }
        )   

    }

    // TODO: Investigate how to get appropriate token to get other users details in tenant. 
    public async getUser(emailId: string): Promise<any> {
        const client: ServiceClient = await createGenericClient();
        const result: HttpOperationResponse = await client.sendRequest({
            method: "GET",
            url: `${this.graphEndpoint}/v1.0/users/${emailId}`,
            headers: {
                Authorization: `Bearer ${this.accessToken}`
            }
        });
        // tslint:disable-next-line: no-unsafe-any
        return <any>(result.parsedBody);
    } 
}