import Wrapper from '../components/Wrapper'
import UsersTable from './UsersTable'
import InviteUserModal from './InviteUserModal'
import ActualiserButton from './ActualiserButton'
import { getUsersList } from './actions'

export default async function AdminPage() {
  const users = await getUsersList()

  return (
    <Wrapper>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <h1 className='text-2xl font-bold'>Gestion des utilisateurs</h1>
        {/* Inviter à gauche, l'icône Actualiser à sa droite */}
        <div className='flex items-center gap-2'>
          <InviteUserModal />
          <ActualiserButton />
        </div>
      </div>
      <UsersTable users={users} />
    </Wrapper>
  )
}