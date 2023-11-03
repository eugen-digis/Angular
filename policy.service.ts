import { Inject, Injectable } from '@angular/core';
import {
  PermissionType,
  Profile,
  ProfileRoleId,
} from '@huma-engineering/shared-models';
import { RBAC_CONFIG } from '../huma-rbac.module';
import { PermissionPolicy } from '../interfaces/role-based-access.interface';
import { RBACConfig } from '../models/role.model';

/**
 * Policy Service.
 */
@Injectable()
export class PolicyService {
  /**
   * @param config - role-based access control configuration
   */
  constructor(@Inject(RBAC_CONFIG) private config: RBACConfig) {}

  /**
   * Has Access.
   *
   * Verify if at least one of user's roles
   * has access to provided policies.
   *
   * @param user - user profile
   * @param policy - privacy permission policy
   * @returns is user has permission to access
   */
  hasAccess(
    user: Profile,
    policy: PermissionPolicy | PermissionPolicy[],
  ): boolean {
    return !!user.roles?.some((role) => {
      const knownRole = this.config.roles[role.roleId];
      return knownRole?.hasPolicy(policy);
    });
  }

  /**
   * Has Access to some.
   *
   * Verify if user has one of the required roles.
   *
   * @param user - user profile
   * @param policy - privacy permission policy
   * @returns is user has permission to access
   */
  hasAccessToSome(
    user: Profile,
    policy: PermissionPolicy | PermissionPolicy[],
  ): boolean {
    return !!user.roles?.some((role) => {
      const knownRole = this.config.roles[role.roleId];
      return knownRole?.hasSomePolicies(policy);
    });
  }

  /**
   * Has Access.
   *
   * Verify if at least one of user's roles
   * has access to provided policies.
   *
   * @param user - user profile
   * @param permissions - privacy permission policy
   * @returns is user has permission to access
   */
  hasPermission(
    user: Profile,
    permissions: PermissionType | PermissionType[],
  ): boolean {
    return !!user.roles?.some((role) => {
      const knownRole = this.config.roles[role.roleId];
      return knownRole?.hasPermission(permissions);
    });
  }

  /**
   * Has Role.
   *
   * Verify if user has provided role by matching role ID.
   *
   * @param user - user profile
   * @param roleId - privacy permission policy
   * @returns is user has permission to access
   */
  hasRole(user: Profile, roleId: string | ProfileRoleId): boolean {
    return !!user.roles?.some((role) => role.roleId === roleId);
  }

  /**
   * Has Roles.
   *
   * Verify if user has provided role by matching role ID.
   * Returns true if at least one roleId is part of the user.
   *
   * @param user - user profile
   * @param roleIds - privacy permission policy
   * @returns is user has permission to access
   */
  hasRoles(user: Profile, roleIds: (string | ProfileRoleId)[]): boolean {
    return !!user.roles?.some((role) => roleIds.includes(role.roleId));
  }

  /**
   * Has Organization Role.
   *
   * Verify if user has at least one organization role.
   *
   * @param user - user profile
   * @returns is user has organization type of role
   */
  hasOrganizationRole(user: Profile): boolean {
    return (
      this.hasOrganizationResourceRole(user) ||
      this.hasRole(user, ProfileRoleId.DEPLOYMENT_STAFF) ||
      this.hasRole(user, ProfileRoleId.CALL_CENTER_STAFF)
    );
  }

  /**
   * Has Organization Role.
   *
   * Verify if user has at least one organization role.
   *
   * @param user - user profile
   * @returns is user has organization type of role
   */
  hasCustomRole(user: Profile): boolean {
    return !!user.roles?.some((role) => {
      const knownRole = this.config.roles[role.roleId];
      return knownRole?.isCustomRole();
    });
  }

  /**
   * Has organization resource role.
   * Verify if user has at least one role with 'organization' resource.
   *
   * @param user - profile
   * @returns organization resource existence flag
   */
  hasOrganizationResourceRole(user: Profile): boolean {
    return !!user.roles?.some(
      (role) => role.resource?.includes('organization'),
    );
  }

  /**
   * Has deployment resource role.
   * Verify if user has at least one role with 'deployment' resource.
   *
   * @param user - profile
   * @returns deployment resource existence flag
   */
  hasDeploymentResourceRole(user: Profile): boolean {
    return !!user.roles?.some((role) => role.resource?.includes('deployment'));
  }

  /**
   * Has Multi Deployment Role.
   *
   * Verify if user has at least one multi deployment role.
   * Such roles can be verified only by IDs, as such role object will contain
   * deployment/organization resource based on method used to invite user (all deployments / selected deployments)
   *
   * @param user - user profile
   * @returns is user has organization type of role
   */
  hasMultiDeploymentRole(user: Profile): boolean {
    const multiDeploymentRoleIds = Object.values(this.config.roles)
      .filter((role) => role.isMultiDeploymentRole())
      .map((role) => role.id);
    return this.hasRoles(user, multiDeploymentRoleIds);
  }
}
