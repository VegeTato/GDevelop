// @flow
import React from 'react';
import HelpOutline from '@material-ui/icons/HelpOutline';
import IconButton from '../IconButton';
import { getHelpLink } from '../../Utils/HelpLink';
import Window from '../../Utils/Window';

type PropsType = {|
  helpPagePath: ?string,
  disabled?: boolean,
  style?: {|
    padding?: number,
    width?: number,
    height?: number,
    transform?: string,
    transition?: string,
    opacity?: number,
    margin?: number,
    marginRight?: number,
    marginLeft?: number,
    marginTop?: number,
    marginBottom?: number,
  |},
  size?: 'small',
|};

/**
 * The icon that can be used in any dialog to open a help page
 */
const HelpIcon = (props: PropsType) => {
  const { helpPagePath } = props;
  if (!helpPagePath) return null;

  return (
    <IconButton
      onClick={() => Window.openExternalURL(getHelpLink(helpPagePath))}
      disabled={props.disabled}
      style={props.style}
      size={props.size}
    >
      <HelpOutline />
    </IconButton>
  );
};

export default HelpIcon;
