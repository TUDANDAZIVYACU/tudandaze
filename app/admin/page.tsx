import Wrapper from '../components/Wrapper'
import UsersTable from './UsersTable'
import InviteUserModal from './InviteUserModal'
import ActualiserButton from './ActualiserButton'
import { getUsersList } from './actions'

export default async function AdminPage() {
  const users = await getUsersList()

  return (
    <Wrapper>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold leading-tight md:text-3xl'>Gestion des utilisateurs</h1>
          <p className='text-sm font-normal opacity-60'>Les personnes qui peuvent se connecter à votre entreprise</p>
        </div>
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
