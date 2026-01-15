import { User, IUser } from "../models/user.model";

export interface FindOrCreateResult {
  user: IUser;
  isNewUser: boolean;
}

/**
 * Find existing user or create new one on first login
 */
export async function findOrCreateUser(
  address: string,
  chainId: number
): Promise<FindOrCreateResult> {
  const normalizedAddress = address.toLowerCase();
  
  const existingUser = await User.findOne({ address: normalizedAddress });
  
  if (existingUser) {
    // Update last login time
    existingUser.lastLoginAt = new Date();
    existingUser.chainId = chainId;
    await existingUser.save();
    
    return { user: existingUser, isNewUser: false };
  }
  
  // Create new user
  const newUser = await User.create({
    address: normalizedAddress,
    chainId,
    lastLoginAt: new Date(),
  });
  
  return { user: newUser, isNewUser: true };
}

/**
 * Find user by address
 */
export async function findUserByAddress(address: string): Promise<IUser | null> {
  return User.findOne({ address: address.toLowerCase() });
}

/**
 * Get user by ID
 */
export async function findUserById(id: string): Promise<IUser | null> {
  return User.findById(id);
}
