/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressLocation, QuickPickItem, window } from "vscode";
import { IActionContext } from "vscode-azureextensionui";
import { ApimService } from "../../azure/apim/ApimService";
import { ResourceGraphService } from "../../azure/resourceGraph/ResourceGraphService";
import { AuthorizationAccessPoliciesTreeItem, IAuthorizationAccessPolicyTreeItemContext } from "../../explorer/AuthorizationAccessPoliciesTreeItem";
import { AuthorizationTreeItem } from "../../explorer/AuthorizationTreeItem";
import { ext } from "../../extensionVariables";
import { localize } from "../../localize";

const systemAssignedManagedIdentitiesOptionLabel = "System Assigned managed identities..."
const userAssignedManagedIdentitiesOptionLabel = "User Assigned managed identities..."
const navigateToAzurePortal = "Navigate to Azure Portal...";

//TODO: Add Groups and ServicePrincipals

let resourceGraphService: ResourceGraphService;

export async function createAuthorizationAccessPolicy(context: IActionContext & Partial<IAuthorizationAccessPolicyTreeItemContext>, node?: AuthorizationAccessPoliciesTreeItem): Promise<void> {
    if (!node) {
        const AuthorizationNode = <AuthorizationTreeItem>await ext.tree.showTreeItemPicker(AuthorizationTreeItem.contextValue, context);
        node = AuthorizationNode.authorizationAccessPoliciesTreeItem;
    }

    const apimService = new ApimService(
        node.root.credentials, 
        node.root.environment.resourceManagerEndpointUrl, 
        node.root.subscriptionId, 
        node.root.resourceGroupName, 
        node.root.serviceName);
    
    resourceGraphService = new ResourceGraphService(
        node.root.credentials, 
        node.root.environment.resourceManagerEndpointUrl, 
        node.root.subscriptionId, 
    );

    const identityOptions = await populateIdentityOptionsAsync(
        apimService, node.root.credentials, node.root.environment.resourceManagerEndpointUrl);
    const identitySelected = await ext.ui.showQuickPick(
        identityOptions, { placeHolder: 'Select Identity...', canPickMany: false, suppressPersistence: true });

    let permissionName = '';
    let oid = '';

    if (identitySelected.label == systemAssignedManagedIdentitiesOptionLabel) {
        const response =  await resourceGraphService.listSystemAssignedIdentities()
        var otherManagedIdentityOptions = await populateManageIdentityOptions(response.data);
        
        var managedIdentitySelected = await ext.ui.showQuickPick(
            otherManagedIdentityOptions, { placeHolder: 'Select System Assigned Managed Identity ...', canPickMany: false, suppressPersistence: true });
        
        permissionName = managedIdentitySelected.label;
        oid = managedIdentitySelected.description!;
    }
    else if (identitySelected.label == userAssignedManagedIdentitiesOptionLabel) {
        const response =  await resourceGraphService.listUserAssignedIdentities()
        var otherManagedIdentityOptions = await populateManageIdentityOptions(response.data);
        
        var managedIdentitySelected = await ext.ui.showQuickPick(
            otherManagedIdentityOptions, { placeHolder: 'Select User Assigned Managed Identity ...', canPickMany: false, suppressPersistence: true });
        
        permissionName = managedIdentitySelected.label;
        oid = managedIdentitySelected.description!;
    }
    else if (identitySelected.label == navigateToAzurePortal) {
       //TODO: Navigate to Azure Portal for better experience. 
       return;
    } 

    context.authorizationAccessPolicyName = permissionName;
    context.authorizationAccessPolicy = {
        objectId: oid,
        tenantId: node.root.tenantId
    }

    window.withProgress(
        {
            location: ProgressLocation.Notification,
            title: localize("creatingAuthorizationPermission", `Creating Access Policy '${permissionName}' for Authorization ${node.root.authorizationName} ...`),
            cancellable: false
        },
        // tslint:disable-next-line:no-non-null-assertion
        async () => { 
            return node!.createChild(context); 
        }
    ).then(async () => {
        // tslint:disable-next-line:no-non-null-assertion
        await node!.refresh(context);
        window.showInformationMessage(localize("createdAuthorizationPermission", `Created Access Policy '${permissionName}' successfully.`));
    });
}

async function populateIdentityOptionsAsync(apimService: ApimService, credential, resourceManagerEndpointUrl: string) : Promise<QuickPickItem[]> {
    const options : QuickPickItem[] = [];

    // 1. Self
    const token = await credential.getToken();
    const meOption : QuickPickItem = {
        label: token.userId,
        description: token.oid,
        detail: "Current User"
    }
    options.push(meOption);

    // 2. APIM Service
    const service = await apimService.getService();
    if (!!service.identity?.principalId) {
        const apimOption : QuickPickItem = {
            label: service.name,
            description: service.identity.principalId,
            detail: "Current Service managed identity"
        }
        options.push(apimOption);
    }

    // 3. Other Managed identities. Dogfood doesn't support this endpoint, so only show this in prod
    if (resourceManagerEndpointUrl == "https://management.azure.com/") {
        const systemAssignedManagedIdentities : QuickPickItem = {
            label: systemAssignedManagedIdentitiesOptionLabel,
            description: "",
            detail: "",
        }
        options.push(systemAssignedManagedIdentities); 
        
        const userAssignedManagedIdentities : QuickPickItem = {
            label: userAssignedManagedIdentitiesOptionLabel,
            description: "",
            detail: "",
        }
        options.push(userAssignedManagedIdentities); 
    }
    
    // 4. Custom
    const customOption : QuickPickItem = {
        label: navigateToAzurePortal,
        description: "",
        detail: "",
    }
    options.push(customOption);
    return options;
}

async function populateManageIdentityOptions(data: any) : Promise<QuickPickItem[]> {
    const options : QuickPickItem[] = [];
    const managedIdentityOptions : QuickPickItem[] = data.filter(d => !!d.principalId).map(d => {
        return {
            label: d.name, 
            description: d.principalId, 
            detail: d.id
        };
    }); 
    options.push(...managedIdentityOptions);

    return options;
}