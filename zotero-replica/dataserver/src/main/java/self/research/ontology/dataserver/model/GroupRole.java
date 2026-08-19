package self.research.ontology.dataserver.model;

/** Mirrors PHP's groupUsers.role enum ('owner','admin','member'). OWNER is never stored in Group.members — it's tracked via Group.ownerEmail, matching the PHP schema's separate ownerUserID column. */
public enum GroupRole {
	OWNER,
	ADMIN,
	MEMBER
}