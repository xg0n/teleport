/**
 * Teleport
 * Copyright (C) 2024 Gravitational, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { routing } from 'teleterm/ui/uri';
import { IAppContext } from 'teleterm/ui/types';

import { App } from 'teleterm/services/tshd/types';
import { getWebAppLaunchUrl, isWebApp } from 'teleterm/services/tshd/app';

import { DocumentOrigin } from './types';

export async function connectToApp(
  ctx: IAppContext,
  target: App,
  telemetry: { origin: DocumentOrigin },
  options?: {
    launchInBrowserIfWebApp: boolean;
  }
): Promise<void> {
  //TODO(gzdunek): Add regular dialogs for connecting to unsupported apps (non HTTP/TCP)
  // that will explain that the user can connect via tsh/Web UI to them.
  // These dialogs should provide instructions, just like those in the Web UI for database access.
  if (target.samlApp) {
    alert('SAML apps are supported only in Web UI.');
    return;
  }

  if (target.awsConsole) {
    alert('AWS apps are supported in Web UI and tsh.');
    return;
  }

  if (target.endpointUri.startsWith('cloud://')) {
    alert('Cloud apps are supported only in tsh.');
    return;
  }

  if (isWebApp(target) && options?.launchInBrowserIfWebApp) {
    captureAppLaunchInBrowser(ctx, target, telemetry);
    const rootCluster = ctx.clustersService.findCluster(
      routing.ensureRootClusterUri(target.uri)
    );
    const cluster = ctx.clustersService.findClusterByResource(target.uri);
    // Generally, links should be opened with <a> elements.
    // Unfortunately, in some cases it is not possible,
    // for example, in the search bar.
    window.open(
      getWebAppLaunchUrl({ app: target, rootCluster, cluster }),
      '_blank',
      'noreferrer,noopener'
    );
    return;
  }

  const rootClusterUri = routing.ensureRootClusterUri(target.uri);
  const documentsService =
    ctx.workspacesService.getWorkspaceDocumentService(rootClusterUri);
  const doc = documentsService.createGatewayDocument({
    targetUri: target.uri,
    origin: telemetry.origin,
    targetName: routing.parseAppUri(target.uri).params.appId,
    targetUser: '',
  });

  const connectionToReuse = ctx.connectionTracker.findConnectionByDocument(doc);

  if (connectionToReuse) {
    await ctx.connectionTracker.activateItem(connectionToReuse.id, {
      origin: telemetry.origin,
    });
  } else {
    await ctx.workspacesService.setActiveWorkspace(rootClusterUri);
    documentsService.add(doc);
    documentsService.open(doc.uri);
  }
}

/**
 * When the app is opened outside Connect,
 * the usage event has to be captured manually.
 */
export function captureAppLaunchInBrowser(
  ctx: IAppContext,
  target: Pick<App, 'uri'>,
  telemetry: { origin: DocumentOrigin }
) {
  ctx.usageService.captureProtocolUse(target.uri, 'app', telemetry.origin);
}
